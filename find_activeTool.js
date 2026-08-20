const fs = require('fs');
const content = fs.readFileSync('d:\\Proyectos\\Nueva carpeta\\IaaaIIII\\components\\AvatarViewer3D.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('activeTool')) {
        console.log(`${index + 1}: ${line}`);
    }
});
