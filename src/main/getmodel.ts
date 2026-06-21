/* eslint-disable prettier/prettier */
import fs from "fs";
import path from "path";

const modelDir = path.join(process.resourcesPath, "models");

const files = fs.readdirSync(modelDir);

console.log(files);