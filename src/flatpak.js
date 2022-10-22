// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as yaml from 'js-yaml';

import * as fs from 'fs';
import * as path from 'path';

export  {
    parseManifest,
    builder,
    buildBundle,
    buildSign,
    buildUpdateRepo,
};


/*
 * Action Inputs
 *
 * Each array is a list of GitHub Action inputs that are automatically mapped to
 * command-line arguments, for the given Flatpak command.
 */
const BUILDER_INPUTS = [
    'arch',
    'gpg-sign',
    'install-deps-from',
    'repo',
];

const BUILD_BUNDLE_INPUTS = [
    'gpg-sign',
];

const BUILD_SIGN_INPUTS = [
    'gpg-sign',
];

const BUILD_UPDATE_REPO_INPUTS = [
    'gpg-sign',
];


/**
 * Parse and coalesce arguments for a command-line program.
 *
 * This function takes lists of strings in the form of `--option` and
 * `--option=value` and eliminates duplicates; first parsing @actionInputs and
 * then applying @overrides.
 *
 * @param {string[]} [actionInputs] - Action inputs that map to CLI options
 * @param {string[]} [overrides] - A list of override arguments
 * @returns {string[]} A list of arguments
 */
function parseArguments(actionInputs = [], overrides = []) {
    /* Use a Map to coalesce options */
    const options = new Map();
    const pattern = /--([^=]+)(?:=([^\b]+))?/;

    /* Map GitHub Action inputs to key-value pairs */
    for (const input of actionInputs) {
        const value = core.getInput(input);
        value && options.set(input, value);
    }

    /* Parse overrides into key-value pairs */
    for (const arg of overrides) {
        const [, option, value] = pattern.exec(arg);
        option && options.set(option, value);
    }

    const args = [];

    for (const [option, value] of options)
        args.push(value ? `--${option}=${value}` : `--${option}`);

    return args;
}

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
            return yaml.load(data);

        default:
            throw TypeError('Unsupported manifest format');
    }
}

/**
 * Build a Flatpak manifest.
 *
 * @param {PathLike} directory - A path to a build directory
 * @param {PathLike} manifest - A path to a manifest
 * @param {string[]} [args] - Command-line options for `flatpak-builder`
 * @returns {Promise<>} A promise for the operation
 */
async function builder(directory, manifest, args = []) {
    core.debug(`${directory}, ${manifest}, ${args}`);

    const builderArgs = parseArguments(BUILDER_INPUTS, args);

    await exec.exec('flatpak-builder', [
        ...builderArgs,
        directory,
        manifest,
    ]);
}

/**
 * Create a single-file bundle from a local repository.
 *
 * See: `flatpak build-bundle --help`.
 *
 * @param {PathLike} location - A path to a Flatpak repository
 * @param {PathLike} fileName - A filename
 * @param {string} name - An application ID
 * @param {string} [branch] - The Flatpak branch (default: master)
 * @param {string[]} [args] - Extra options for `flatpak build-bundle`
 * @returns {Promise<>} A promise for the operation
 */
async function buildBundle(location, fileName, name, branch = 'master', args = []) {
    core.debug(`${location}, ${fileName}, ${name}, ${branch}, ${args}`);

    const bundleArgs = parseArguments(BUILD_BUNDLE_INPUTS, args);

    await exec.exec('flatpak', [
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
 * @param {PathLike} locateion - A path to a Flatpak repository
 * @param {string[]} [args] - Command-line options for `flatpak build-sign`
 * @returns {Promise<>} A promise for the operation
 */
async function buildSign(location, args = []) {
    core.debug(`${location}, ${args}`);

    const signArgs = parseArguments(BUILD_SIGN_INPUTS, args);

    await exec.exec('flatpak', [
        'build-sign',
        ...signArgs,
        location,
    ]);
}


/**
 * Update repository metadata.
 *
 * @param {PathLike} locateion - A path to a Flatpak repository
 * @param {string[]} [args] - Command-line options for `flatpak build-sign`
 * @returns {Promise<>} A promise for the operation
 */
async function buildUpdateRepo(location, args = ['--prune']) {
    core.debug(`${location}, ${args}`);

    const signArgs = parseArguments(BUILD_UPDATE_REPO_INPUTS, args);

    await exec.exec('flatpak', [
        'build-update-repo',
        ...signArgs,
        location,
    ]);
}

