// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as cache from '@actions/cache';
import * as core from '@actions/core';


async function run() {
    try {
        // Inputs are re-evaluted before the post action, so we want the
        // original key used for restore
        const primaryKey = core.getState('cache-primary-key');
        if (!primaryKey) {
            core.info('[warning] Error retrieving key from state');
            return;
        }

        const state = core.getState('cache-state');
        if (primaryKey === state) {
            core.info(`[skipping] Cache hit on the primary key ${primaryKey}`);
            return;
        }

        const cachePaths = [core.getInput('repo')];
        const cacheId = await cache.saveCache(cachePaths, primaryKey);

        if (cacheId != -1)
            core.info(`Cache saved with key: ${primaryKey}`);
    } catch (error) {
        core.info(`[warning] ${error.message}`);
    }
}

run();

export default run;

