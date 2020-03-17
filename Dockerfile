FROM ubuntu:16.04

RUN apt-get update && apt-get install -y curl && apt-get install -y libfontconfig && curl -sL https://deb.nodesource.com/setup_8.x -o nodesource_setup.sh && bash nodesource_setup.sh && apt-get install -y nodejs

COPY ./output/bundle /app

WORKDIR /app/programs/server

RUN npm install --production

WORKDIR /app

ENTRYPOINT ["/bin/bash", "-c", "node main.js"]
