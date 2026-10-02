import { copyFileSync, constants } from "node:fs";
for (const [source, destination] of [
  [".openai/hosting.example.json", ".openai/hosting.json"],
  [".dev.vars.example", ".dev.vars"],
]) {
  try {
    copyFileSync(source, destination, constants.COPYFILE_EXCL);
    console.log(`Created ${destination} from the public template.`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log(`Kept existing ${destination}.`);
  }
}
