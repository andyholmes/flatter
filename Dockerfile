# SPDX-License-Identifier: CC0-1.0
# SPDX-FileCopyrightText: No rights reserved

FROM registry.fedoraproject.org/fedora:latest

COPY build-aux/ /build-aux/

# Notes:
#   - docker:          docker/setup-qemu-action
#   - python3-*:       flatpak/flatpak-external-data-checker
#   - rsync:           JamesIves/github-pages-deploy-action
#   - zstd:            actions/cache
RUN dnf install -y ccache flatpak flatpak-builder git git-lfs \
                   dbus-daemon xorg-x11-server-Xvfb xwayland-run \
                   docker \
                   python3-{aiohttp,apt,editorconfig,github,gobject,jsonschema,lxml,magic,packaging,pyelftools,ruamel-yaml,semver,toml} \
                   rsync \
                   zstd && \
    dnf install -y 'dnf-command(builddep)' && \
    dnf builddep -y appstream flatpak-builder && \
    dnf clean all && rm -rf /var/cache/dnf

#
# AppStream & Flatpak Builder with compose pass-through
#
RUN git clone https://github.com/ximion/appstream.git \
              --branch v1.0.3 \
              --single-branch && \
    cd appstream && \
    git apply /build-aux/patches/appstream-demotion-allowlist.patch && \
    git apply /build-aux/patches/appstream-compose-default-propagate-custom.patch && \
    git apply /build-aux/patches/asc-hint-tags-silence-some-vague-validation-errors.patch && \
    git apply /build-aux/patches/compose-seperate-file-read-error.patch && \
    git apply /build-aux/patches/appstream-compose-lang-symlinks.patch && \
    meson setup -Dapidocs=false \
                -Dgir=false \
                -Dcompose=true \
                _build && \
    meson install -C _build

RUN git clone https://github.com/flatpak/flatpak-builder.git \
              --branch 1.4.4 \
              --single-branch && \
    cd flatpak-builder && \
    git apply /build-aux/patches/flatpak-builder-lfs.patch && \
    git apply /build-aux/patches/flatpak-builder-appstream-cli-urls.patch && \
    git apply /build-aux/patches/flatpak-builder-disable-compressed-downloads.patch && \
    meson setup -Ddocs=disabled \
                -Dfuse=2 \
                -Dtests=false \
                _build && \
    meson install -C _build

#
# Flatpak Dependency Checker
#
RUN git clone https://github.com/flathub/flatpak-external-data-checker.git \
              --branch master \
              --single-branch && \
    ln -sf $(pwd)/flatpak-external-data-checker/flatpak-external-data-checker \
           /usr/bin/flatpak-external-data-checker

#
# Default Remotes
#
RUN flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo && \
    flatpak remote-add --if-not-exists flathub-beta https://flathub.org/beta-repo/flathub-beta.flatpakrepo && \
    flatpak remote-add --if-not-exists gnome-nightly https://nightly.gnome.org/gnome-nightly.flatpakrepo

