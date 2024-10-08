# SPDX-License-Identifier: CC0-1.0
# SPDX-FileCopyrightText: No rights reserved

FROM registry.fedoraproject.org/fedora:latest

# Notes:
#   - docker:          docker/setup-qemu-action
#   - python3-*:       flatpak/flatpak-external-data-checker
#   - rsync:           JamesIves/github-pages-deploy-action
#   - zstd:            actions/cache
RUN dnf install -y ccache flatpak flatpak-builder git git-lfs \
                   dbus-daemon xorg-x11-server-Xvfb \
                   docker \
                   python3-{aiohttp,apt,editorconfig,github,gobject,jsonschema,lxml,magic,packaging,pyelftools,ruamel-yaml,semver,toml} \
                   rsync \
                   zstd && \
    dnf clean all && rm -rf /var/cache/dnf

RUN git clone https://github.com/flathub/flatpak-external-data-checker.git \
              --branch master \
              --single-branch && \
    ln -sf $(pwd)/flatpak-external-data-checker/flatpak-external-data-checker \
           /usr/bin/flatpak-external-data-checker

RUN flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo && \
    flatpak remote-add --if-not-exists flathub-beta https://flathub.org/beta-repo/flathub-beta.flatpakrepo && \
    flatpak remote-add --if-not-exists gnome-nightly https://nightly.gnome.org/gnome-nightly.flatpakrepo
