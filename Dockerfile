FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY bcparks-bot.js ./

CMD [ "node", "bcparks-bot.js" ]