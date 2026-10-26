import {createHash} from 'node:crypto';
import {planBuildPack} from './product-research-model.mjs';
export {validateDossier} from './product-research-model.mjs';
export function createBuildPack(input) {
  const pack = planBuildPack(input);
  return {...pack, digest:createHash('sha256').update(JSON.stringify(pack)).digest('hex')};
}
