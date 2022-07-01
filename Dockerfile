FROM node:18-alpine
WORKDIR /app
COPY package.json /app
COPY yarn.lock /app
ENV PATH=$PATH:/root/.pulumi/bin
RUN apk update && \
    apk add --no-cache curl libc6-compat && \
    curl -fsSL https://get.pulumi.com/ | sh;
RUN yarn install
COPY . /app
RUN yarn run tsc
CMD yarn node ./bin/index.js