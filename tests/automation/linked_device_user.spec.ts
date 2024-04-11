/* eslint-disable no-await-in-loop */
import { expect, test } from '@playwright/test';
import { sleepFor } from '../promise_utils';
import { newUser } from './setup/new_user';
import { openApp } from './setup/open';
import { createContact } from './utilities/create_contact';
import { linkedDevice } from './utilities/linked_device';
import { sendMessage } from './utilities/message';
import {
  clickOnElement,
  clickOnMatchingText,
  clickOnTestIdWithText,
  clickOnTextMessage,
  doWhileWithMax,
  hasTextMessageBeenDeleted,
  typeIntoInput,
  waitForLoadingAnimationToFinish,
  waitForMatchingPlaceholder,
  waitForMatchingText,
  waitForTestIdWithText,
  waitForTextMessage,
} from './utilities/utils';

test('Link a device', async () => {
  const [windowA] = await openApp(1); // not using sessionTest here as we need to close and reopen one of the window
  const userA = await newUser(windowA, 'Alice');
  const [windowB] = await linkedDevice(userA.recoveryPhrase); // not using sessionTest here as we need to close and reopen one of the window
  await clickOnTestIdWithText(windowA, 'leftpane-primary-avatar');
  // Verify Username
  await waitForTestIdWithText(windowA, 'your-profile-name', userA.userName);
  // Verify Session ID
  await waitForTestIdWithText(windowA, 'your-session-id', userA.sessionid);
  // exit profile module
  await clickOnTestIdWithText(windowA, 'modal-close-button');
  // You're almost finished isn't displayed
  const errorDesc = 'Should not be found';
  try {
    const elemShouldNotBeFound = windowB.locator(
      '[data-testid=reveal-recovery-phrase]',
    );
    if (elemShouldNotBeFound) {
      console.error(
        'Continue to save recovery phrase not found, excellent news',
      );
      throw new Error(errorDesc);
    }
  } catch (e) {
    if (e.message !== errorDesc) {
      // this is NOT ok
      throw e;
    }
  }
});

test('Changed username syncs', async () => {
  const [windowA] = await openApp(1);
  const userA = await newUser(windowA, 'Alice');
  const [windowB] = await linkedDevice(userA.recoveryPhrase);
  const newUsername = 'Tiny bubble';
  await clickOnTestIdWithText(windowA, 'leftpane-primary-avatar');
  // Click on pencil icon
  await clickOnTestIdWithText(windowA, 'edit-profile-icon');
  // Replace old username with new username
  await typeIntoInput(windowA, 'profile-name-input', newUsername);
  // Press enter to confirm change
  await clickOnElement({
    window: windowA,
    strategy: 'data-testid',
    selector: 'save-button-profile-update',
  });
  // Wait for loading animation
  await waitForLoadingAnimationToFinish(windowA, 'loading-spinner');

  // Check username change in window B
  // Click on profile settings in window B
  // Waiting for the username to change
  await doWhileWithMax(
    15000,
    500,
    'waiting for updated username in profile dialog',
    async () => {
      await clickOnTestIdWithText(windowB, 'leftpane-primary-avatar');
      // Verify username has changed to new username
      try {
        await waitForTestIdWithText(
          windowB,
          'your-profile-name',
          newUsername,
          100,
        );
        return true;
      } catch (e) {
        // if waitForTestIdWithText doesn't find the right username, close the window and retry
        return false;
      } finally {
        await clickOnElement({
          window: windowB,
          strategy: 'data-testid',
          selector: 'modal-close-button',
        });
      }
    },
  );
});

// eslint-disable-next-line no-empty-pattern
test('Profile picture syncs', async ({}, testinfo) => {
  const [windowA] = await openApp(1); // not using sessionTest here as we need to close and reopen one of the window
  const userA = await newUser(windowA, 'Alice');
  const [windowB] = await linkedDevice(userA.recoveryPhrase); // not using sessionTest here as we need to close and reopen one of the window
  await clickOnTestIdWithText(windowA, 'leftpane-primary-avatar');
  // Click on current profile picture
  await waitForTestIdWithText(windowA, 'copy-button-profile-update', 'Copy');

  await clickOnTestIdWithText(windowA, 'image-upload-section');
  await clickOnTestIdWithText(windowA, 'image-upload-click');
  await clickOnTestIdWithText(windowA, 'save-button-profile-update');
  await waitForTestIdWithText(windowA, 'loading-spinner');

  if (testinfo.config.updateSnapshots === 'all') {
    await sleepFor(15000, true); // long time to be sure a poll happened when we want to update the snapshot
  } else {
    await sleepFor(2000); // short time as we will loop right below until the snapshot is what we expect
  }
  const leftpaneAvatarContainer = await waitForTestIdWithText(
    windowB,
    'leftpane-primary-avatar',
  );
  const start = Date.now();
  let correctScreenshot = false;
  let tryNumber = 0;
  let lastError: Error | undefined;
  do {
    try {
      await sleepFor(500);

      const screenshot = await leftpaneAvatarContainer.screenshot({
        type: 'jpeg',
        // path: 'avatar-updated-blue',
      });
      expect(screenshot).toMatchSnapshot({ name: 'avatar-updated-blue.jpeg' });
      correctScreenshot = true;
      console.warn(
        `screenshot matching of "Check profile picture syncs" passed after "${tryNumber}" retries!`,
      );
    } catch (e) {
      lastError = e;
    }
    tryNumber++;
  } while (Date.now() - start <= 20000 && !correctScreenshot);

  if (!correctScreenshot) {
    console.warn(
      `screenshot matching of "Check profile picture syncs" try "${tryNumber}" failed with: ${lastError?.message}`,
    );
    throw new Error('waited 20s and still the screenshot is not right');
  }
});

test('Contacts syncs', async () => {
  const [windowA, windowC] = await openApp(2); // not using sessionTest here as we need to close and reopen one of the window
  const [userA, userB] = await Promise.all([
    newUser(windowA, 'Alice'),
    newUser(windowC, 'Bob'),
  ]);
  const [windowB] = await linkedDevice(userA.recoveryPhrase); // not using sessionTest here as we need to close and reopen one of the window
  await createContact(windowA, windowC, userA, userB);
  // linked device (windowB)
  await waitForTestIdWithText(
    windowB,
    'module-conversation__user__profile-name',
    userB.userName,
  );
  console.info('Contacts correctly synced');
});

test('Deleted message syncs', async () => {
  const [windowA, windowC] = await openApp(2);
  const [userA, userB] = await Promise.all([
    newUser(windowA, 'Alice'),
    newUser(windowC, 'Bob'),
  ]);
  const [windowB] = await linkedDevice(userA.recoveryPhrase);
  const messageToDelete = 'Testing deletion functionality for linked device';
  await createContact(windowA, windowC, userA, userB);
  await sendMessage(windowA, messageToDelete);
  // Navigate to conversation on linked device and for message from user A to user B
  await clickOnTestIdWithText(
    windowB,
    'module-conversation__user__profile-name',
    userB.userName,
  );
  await Promise.all([
    waitForTextMessage(windowB, messageToDelete),
    waitForTextMessage(windowC, messageToDelete),
  ]);
  await clickOnTextMessage(windowA, messageToDelete, true);
  await clickOnMatchingText(windowA, 'Delete');
  await clickOnTestIdWithText(windowA, 'session-confirm-ok-button', 'Delete');
  await waitForTestIdWithText(windowA, 'session-toast', 'Deleted');
  await hasTextMessageBeenDeleted(windowA, messageToDelete, 6000);
  // linked device for deleted message
  // Waiting for message to be removed
  // Check for linked device
  await hasTextMessageBeenDeleted(windowB, messageToDelete, 10000);
  // Still should exist for user B
  await waitForMatchingText(windowC, messageToDelete);
});

test('Unsent message syncs', async () => {
  const [windowA, windowC] = await openApp(2);
  const [userA, userB] = await Promise.all([
    newUser(windowA, 'Alice'),
    newUser(windowC, 'Bob'),
  ]);
  const [windowB] = await linkedDevice(userA.recoveryPhrase);
  const unsentMessage = 'Testing unsending functionality for linked device';
  await createContact(windowA, windowC, userA, userB);
  await sendMessage(windowA, unsentMessage);
  // Navigate to conversation on linked device and for message from user A to user B
  await clickOnTestIdWithText(
    windowB,
    'module-conversation__user__profile-name',
    userB.userName,
  );
  await Promise.all([
    waitForTextMessage(windowB, unsentMessage),
    waitForTextMessage(windowC, unsentMessage),
  ]);
  await clickOnTextMessage(windowA, unsentMessage, true);
  await clickOnMatchingText(windowA, 'Delete');
  await clickOnMatchingText(windowA, 'Delete for everyone');
  await clickOnElement({
    window: windowA,
    strategy: 'data-testid',
    selector: 'session-confirm-ok-button',
  });
  await waitForTestIdWithText(windowA, 'session-toast', 'Deleted');
  await hasTextMessageBeenDeleted(windowA, unsentMessage, 1000);
  await waitForMatchingText(windowC, 'This message has been deleted');
  // linked device for deleted message
  await hasTextMessageBeenDeleted(windowB, unsentMessage, 1000);
});

test('Blocked user syncs', async () => {
  const [windowA, windowC] = await openApp(2);
  const [userA, userB] = await Promise.all([
    newUser(windowA, 'Alice'),
    newUser(windowC, 'Bob'),
  ]);
  const [windowB] = await linkedDevice(userA.recoveryPhrase);
  const testMessage = 'Testing blocking functionality for linked device';

  await createContact(windowA, windowC, userA, userB);
  await sendMessage(windowA, testMessage);
  // Navigate to conversation on linked device and check for message from user A to user B
  await clickOnTestIdWithText(
    windowB,
    'module-conversation__user__profile-name',
    userB.userName,
    true,
  );
  // Select block
  await clickOnMatchingText(windowB, 'Block');
  // Verify toast notification 'blocked'
  await waitForTestIdWithText(windowB, 'session-toast', 'Blocked');
  // Verify the user was moved to the blocked contact list
  // Click on settings tab
  await waitForMatchingPlaceholder(
    windowA,
    'message-input-text-area',
    'Unblock this contact to send a message.',
  );
  // reveal-blocked-user-settings is not updated once opened
  // Check linked device for blocked contact in settings screen
  await clickOnTestIdWithText(windowB, 'settings-section');
  await clickOnTestIdWithText(windowB, 'conversations-settings-menu-item');
  // a conf sync job can take 30s (if the last one failed) +  10s polling to show a change on a linked device.
  await clickOnTestIdWithText(
    windowB,
    'reveal-blocked-user-settings',
    undefined,
    undefined,
    50000,
  );
  // Check if user B is in blocked contact list
  await waitForMatchingText(windowB, userB.userName);
});
