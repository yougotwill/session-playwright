import { _electron as electron } from '@playwright/test';

import chalk from 'chalk';
import { isEmpty } from 'lodash';
import { join } from 'path';
import { v4 } from 'uuid';

export const NODE_ENV = 'production';
export const MULTI_PREFIX = 'test-integration-';
const multisAvailable = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function getAppRootPath() {
  if (isEmpty(process.env.SESSION_DESKTOP_ROOT)) {
    throw new Error(
      "You need to set the 'SESSION_DESKTOP_ROOT' env variable to the session folder you want to test first",
    );
  }
  return process.env.SESSION_DESKTOP_ROOT as string;
}

function getSessionDesktopBinPath() {
  if (isEmpty(process.env.SESSION_DESKTOP_BIN)) {
    throw new Error(
      "You need to set the 'SESSION_DESKTOP_BIN' env variable to the session-desktop bin you want to test first (maybe `/usr/bin/session-desktop` ?)",
    );
  }
  return process.env.SESSION_DESKTOP_BIN as string;
}

export async function openApp(windowsToCreate: number) {
  if (windowsToCreate >= multisAvailable.length) {
    throw new Error(`Do you really need ${multisAvailable.length} windows?!`);
  }
  // if windowToCreate = 3, this array will be ABC. If windowToCreate = 5, this array will be ABCDE
  const multisToUse = multisAvailable.slice(0, windowsToCreate);

  const array = [...multisToUse];
  const toRet = [];
  for (let index = 0; index < array.length; index++) {
    const element = array[index];
    // eslint-disable-next-line no-await-in-loop
    const openedWindow = await openAppAndWait(`${element}`);
    toRet.push(openedWindow);
  }
  console.log(
    chalk.bgRedBright(`Pathway to app: `, process.env.SESSION_DESKTOP_ROOT),
  );
  return toRet;
}

const openElectronAppOnly = async (multi: string) => {
  process.env.MULTI = `${multi}`;
  // using a v4 uuid, as timestamps to the ms are sometimes the same (when a bunch of workers are started)
  const uniqueId = v4();
  process.env.NODE_APP_INSTANCE = `${MULTI_PREFIX}-devprod-${uniqueId}-${process.env.MULTI}`;
  process.env.NODE_ENV = NODE_ENV;

  if (!isEmpty(process.env.CI)) {
    const sessionBinPath = getSessionDesktopBinPath();
    const fakeHome = `/tmp/${process.env.NODE_APP_INSTANCE}`;

    console.info(`   CI RUN`);
    console.info(`   SESSION_BIN_PATH=${sessionBinPath}`);
    console.info(`   HOME="${fakeHome}"`);

    process.env.HOME = fakeHome;

    return electron.launch({
      executablePath: sessionBinPath,
    });
  }
  console.info(`   NON CI RUN`);
  console.info('   NODE_ENV', process.env.NODE_ENV);
  console.info('   NODE_APP_INSTANCE', process.env.NODE_APP_INSTANCE);

  const electronApp = await electron.launch({
    args: [join(getAppRootPath(), 'ts', 'mains', 'main_node.js')],
  });
  return electronApp;
};

const openAppAndWait = async (multi: string) => {
  const electronApp = await openElectronAppOnly(multi);
  // Get the first window that the app opens, wait if necessary.
  const window = await electronApp.firstWindow();

  // await window.reload();
  return window;
};
