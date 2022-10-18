// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as cache from '@actions/cache';
import * as core from '@actions/core';


async function run() {
    try {
        // Cache key from state; inputs are re-evaluated before the post action
        const cacheKey = core.getState('cache-key');
        if (!cacheKey) {
            core.debug(`Cache disabled`);
            return;
        }

        // There was a hit on the cache key
        const cacheHit = core.getState('cache-hit');
        if (cacheHit) {
            core.debug(`Cache hit with ${cacheKey}`);
            return;
        }

        const cachePaths = [core.getInput('repo')];
        const cacheId = await cache.saveCache(cachePaths, cacheKey);

        if (cacheId != -1)
            core.info(`Cache saved with ${cacheKey}`);
    } catch (error) {
        core.warning(`Failed to save cache: ${error.message}`);
    }
}

run();

export default run;

