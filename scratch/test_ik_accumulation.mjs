import * as THREE from 'three';
import { CCDIKSolver } from 'three-stdlib';

const root = new THREE.Group();
const skinnedMesh = new THREE.SkinnedMesh();
root.add(skinnedMesh);

const boneCenter = new THREE.Bone(); boneCenter.name = 'センター';
const boneThigh = new THREE.Bone(); boneThigh.name = '左足'; boneThigh.position.set(1, 10, 0);
const boneKnee = new THREE.Bone(); boneKnee.name = '左ひざ'; boneKnee.position.set(0, -5, 0);
const boneAnkle = new THREE.Bone(); boneAnkle.name = '左足首'; boneAnkle.position.set(0, -5, 0);
const boneIk = new THREE.Bone(); boneIk.name = '左足ＩＫ'; boneIk.position.set(1, 0, 0);

skinnedMesh.add(boneCenter);
boneCenter.add(boneThigh);
boneThigh.add(boneKnee);
boneKnee.add(boneAnkle);
boneCenter.add(boneIk);

const bones = [boneCenter, boneThigh, boneKnee, boneAnkle, boneIk];
const skeleton = new THREE.Skeleton(bones);
skinnedMesh.bind(skeleton);

const iks = [{
  target: 4,
  effector: 3,
  links: [
    { index: 2, limitation: new THREE.Vector3(0, 0, 0), rotationMin: new THREE.Vector3(-Math.PI, 0, 0), rotationMax: new THREE.Vector3(-0.01, 0, 0) },
    { index: 1 }
  ],
  iteration: 15
}];

const ikSolver = new CCDIKSolver(skinnedMesh, iks);

// Suppose the IK target is stationary at y=1, z=1
boneIk.position.set(1, 1, 1);

console.log('--- TEST WITHOUT RESTORING BONES ---');
for (let frame = 1; frame <= 5; frame++) {
  root.updateMatrixWorld(true);
  ikSolver.update();
  console.log(`Frame ${frame} Thigh quat:`, boneThigh.quaternion.toArray());
  console.log(`Frame ${frame} Knee quat:`, boneKnee.quaternion.toArray());
}

// Reset
boneThigh.quaternion.set(0, 0, 0, 1);
boneKnee.quaternion.set(0, 0, 0, 1);

console.log('\n--- TEST WITH RESTORING BONES (like MMDAnimationHelper) ---');
for (let frame = 1; frame <= 5; frame++) {
  // Restore rest pose before IK
  boneThigh.quaternion.set(0, 0, 0, 1);
  boneKnee.quaternion.set(0, 0, 0, 1);

  root.updateMatrixWorld(true);
  ikSolver.update();
  console.log(`Frame ${frame} Thigh quat:`, boneThigh.quaternion.toArray());
  console.log(`Frame ${frame} Knee quat:`, boneKnee.quaternion.toArray());
}
