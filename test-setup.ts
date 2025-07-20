import { beforeAll, afterAll } from "bun:test";
import { mkdirSync , readdirSync, unlinkSync } from "fs";
beforeAll(() => {
  // global setup
  mkdirSync('./logs', { recursive: true });
});

afterAll(() => {
  // cleanup logs folder from all files. 
  for (const file of readdirSync('./logs')) {
    unlinkSync(`./logs/${file}`);
  }
  

});