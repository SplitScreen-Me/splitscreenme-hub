FROM ubuntu:16.04

# Node 12 from the official nodejs.org build (the NodeSource apt repo for Node 12 no longer verifies).
ENV NODE_VERSION=12.22.12
ENV NODE_SHA256=ff92a45c4d03e8e270bec1ab337b8fff6e9de293dabfe7e8936a41f2fb0b202e

RUN apt-get update && apt-get install -y curl ca-certificates libfontconfig && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz -o node.tar.gz && echo "${NODE_SHA256}  node.tar.gz" | sha256sum -c - && tar -xzf node.tar.gz -C /usr/local --strip-components=1 && rm node.tar.gz && node -v && npm -v

COPY ./output/bundle /app

WORKDIR /app/programs/server

RUN npm install --production

WORKDIR /app

ENTRYPOINT ["/bin/bash", "-c", "node main.js"]
