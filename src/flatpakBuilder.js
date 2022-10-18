// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as core from '@actions/core';
import * as exec from '@actions/exec';

export {
    CACHE_PATHS,
    run,
};


const CACHE_PATHS = [
    '.flatpak-builder',
];

const FLATPAK_BUILDER_OPTIONS = [
    'default-branch',
    'gpg-sign',
    'gpg-homedir',
    'install-deps-from',
    'repo',
];


/**
 * Build a Flatpak manifest.
 *
 * @param {PathLike} directory - A path to a build directory
 * @param {PathLike} manifest - A path to a manifest
 * @param {string[]} [args] - Command-line options for `flatpak-builder`
 */
function run(directory, manifest, args = []) {
    core.debug(`${directory}, ${manifest}, ${args}`);

    /* Base options, with @args */
    const buildArgs = new Set([
        '--ccache',
        '--disable-rofiles-fuse',
        '--force-clean',
        '--require-changes',
        ...args
    ]);

    /* Add arguments from inputs */
    for (const option of FLATPAK_BUILDER_OPTIONS) {
        if (core.getInput(option))
            buildArgs.add(`--${option}=${core.getInput(option)}`);
    }

    return exec.exec('flatpak-builder', [
        ...buildArgs,
        directory,
        manifest,
    ]);
}

