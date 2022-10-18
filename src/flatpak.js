// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as yaml from 'js-yaml';

import * as fs from 'fs';
import * as path from 'path';

export  {
    parseManifest,
    buildBundle,
    signRepository,
};

/**
 * Load a manifest
 *
 * @param {PathLike} manifestPath - A path to a Flatpak manifest
 */
async function parseManifest(manifestPath) {
    const data = await fs.promises.readFile(manifestPath);

    switch (path.extname(manifestPath)) {
        case '.json':
            return JSON.parse(data);

        case '.yaml':
        case '.yml':
            return yaml.safeLoad(data);

        default:
            throw TypeError('Unsupported manifest format');
    }
}

const FLATPAK_BUILD_BUNDLE_OPTIONS = [
    'gpg-sign',
    'gpg-homedir',
    'gpg-keys',
];

/**
 * Build a Flatpak bundle.
 *
 * @param {PathLike} location - A path to a Flatpak repository
 * @param {PathLike} fileName - A filename
 * @param {string} name - An application ID
 * @param {string} [branch] - The Flatpak branch (default: master)
 * @param {string[]} [args] - Extra options for `flatpak build-bundle`
 * @returns {Promise<>} A promise for the operation
 */
async function buildBundle(location, fileName, name, branch = 'master', args = []) {
    const bundleArgs = new Set(args);

    for (const option of FLATPAK_BUILD_BUNDLE_OPTIONS) {
        if (core.getInput(option))
            bundleArgs.add(`--${option}=${core.getInput(option)}`);
    }

    return exec.exec('flatpak', [
        'build-bundle',
        ...bundleArgs,
        location,
        fileName,
        name,
        branch,
    ]);
}

/**
 * Sign a Flatpak repository.
 *
 * @param {PathLike} location - A path to a repository
 * @param {string} gpgKey - The GPG key to sign with
 */
async function signRepository(location, args = []) {
    const signArgs = new Set(args);

    for (const option of ['gpg-sign', 'gpg-homedir']) {
        if (core.getInput(option))
            signArgs.add(`--${option}=${core.getInput(option)}`);
    }

    await exec.exec('flatpak', [
        'build-sign',
        ...signArgs,
        location,
    ]);
    await exec.exec('flatpak', [
        'build-update-repo',
        ...signArgs,
        location,
    ]);
}

