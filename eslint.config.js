// SPDX-License-Identifier: CC0-1.0
// SPDX-FileCopyrightText: No rights reserved

import globals from "globals";
import { defineConfig } from "eslint/config";
import js from "@eslint/js";

export default defineConfig([
    {
        ignores: ["dist/**"],
    },
    {
        plugins: {
            js,
        },
        extends: ["js/recommended"],
        rules: {
            "no-process-env": "off",
            "no-unused-vars": ["warn", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_",
            }],
            semi: ["error", "always"],
        },
        languageOptions: {
            globals: globals.node,
        },
    },
]);
