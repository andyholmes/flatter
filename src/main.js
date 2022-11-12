// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileCopyrightText: 2022 Andy Holmes <andrew.g.r.holmes@gmail.com>

import * as artifact from '@actions/artifact';
import * as core from '@actions/core';

import * as fs from 'fs';
import * as path from 'path';

import * as flatter from './flatter.js';
import * as utils from './utils.js';


async function includeFiles(repo) {
    const files = core.getMultilineInput('include-files');
    const operations = files.map(src => {
        const dest = path.join(repo, path.basename(src));
        return fs.promises.copyFile(src, dest);
    });

    return Promise.allSettled(operations);
}

/**
 * Run the action
 */
async function run() {
    const manifests = core.getMultilineInput('files');
    const repo = core.getInput('repo');

    /*
     * Build the Flatpak manifests
     */
    if (core.getInput('run-tests')) {
        for (const manifest of manifests) {
            core.startGroup(`Testing "${manifest}"...`);

            try {
                await flatter.testApplication(repo, manifest);
            } catch (e) {
                core.setFailed(`Testing "${manifest}": ${e.message}`);
            }

            core.endGroup();
        }
    } else {
        await flatter.restoreCache(repo);

        for (const manifest of manifests) {
            core.startGroup(`Building "${manifest}"...`);

            try {
                await flatter.buildApplication(repo, manifest);
            } catch (e) {
                core.setFailed(`Failed to build "${manifest}": ${e.message}`);
            }

            core.endGroup();
        }

        await flatter.saveCache(repo);
    }

    if (process.exitCode === core.ExitCode.Failure)
        return;

    /*
     * GitHub Pages Artifact
     */
    if (core.getBooleanInput('upload-pages-artifact')) {
        core.startGroup('Uploading GitHub Pages artifact...');

        try {
            // Generate a .flatpakrepo file
            await flatter.generateDescription(repo);

            // Copy extra files to the repository directory
            await includeFiles(repo);

            // Upload the repository directory as a Github Pages artifact
            await utils.uploadPagesArtifact(repo);
        } catch (e) {
            core.setFailed(`Failed to upload artifact: ${e.message}`);
        }

        core.endGroup();

        if (process.exitCode === core.ExitCode.Failure)
            return;
    }

    /*
     * Flatpak Bundles
     */
    if (core.getBooleanInput('upload-bundles')) {
        core.startGroup('Uploading Flatpak bundles...');

        const artifactClient = artifact.create();

        for (const manifest of manifests) {
            try {
                const filePath = await flatter.bundleApplication(repo,
                    manifest);
                const artifactName = filePath.replace('.flatpak',
                    `-${core.getInput('arch')}`);

                await artifactClient.uploadArtifact(artifactName, [filePath],
                    '.', { continueOnError: false });
            } catch (e) {
                core.setFailed(`Failed to bundle "${manifest}": ${e.message}`);
            }
        }

        core.endGroup();
    }
}

run();

export default run;
    
