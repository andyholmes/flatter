// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as cache from '@actions/cache';
import * as core from '@actions/core';


async function run() {
    try {
        const primaryKey = core.getInput('cache-key') || 'flatter';
        core.saveState('cache-primary-key', primaryKey);

        const restoreKeys = ['flatter'];
        const cachePaths = [core.getInput('repo')];
        const cacheKey = await cache.restoreCache(cachePaths, primaryKey,
            restoreKeys);

        if (!cacheKey) {
            core.info(
                `Cache not found for input keys: ${[
                    primaryKey,
                    ...restoreKeys
                ].join(", ")}`
            );
            return;
        }

        // Store the matched cache key
        core.saveState('cache-state', cacheKey);
        core.saveState('cache-hit', primaryKey === cacheKey);

        core.info(`Cache restored from key: ${cacheKey}`);
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();

export default run;

