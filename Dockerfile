# SPDX-License-Identifier: CC0-1.0
# SPDX-FileCopyrightText: No rights reserved

FROM registry.fedoraproject.org/fedora:latest

# Additional packages:
#   - rsync: JamesIves/github-pages-deploy-action
#   - zstd:  actions/cache
RUN dnf install -y ccache \
                   flatpak \
                   flatpak-builder \
                   git \
                   git-lfs \
                   rsync \
                   zstd && \
    dnf clean all && rm -rf /var/cache/dnf

RUN flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
