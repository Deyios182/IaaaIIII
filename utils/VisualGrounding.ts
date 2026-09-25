/**
 * VisualGrounding.ts
 * 
 * Este módulo procesa capturas de pantalla crudas, dibujando una cuadrícula 10x10 
 * (Set-of-Mark) y etiquetando los cuadrantes de A1 a J10 para facilitar 
 * la visión espacial de Nova (Visual Grounding).
 */

export interface ProcessedScreen {
  imageBase64: string; // JPEG optimizado
  gridInfo: {
    columns: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    labels: string[]; // Ej: ['A1', 'A2', ...]
  };
}

export async function processScreenWithGrid(rawBase64: string): Promise<ProcessedScreen> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No 2d context');

      const width = img.width;
      const height = img.height;
      canvas.width = width;
      canvas.height = height;

      // Dibujar imagen base
      ctx.drawImage(img, 0, 0, width, height);

      // Configuración de la cuadrícula
      const COLS = 10;
      const ROWS = 10;
      const cellWidth = width / COLS;
      const cellHeight = height / ROWS;

      // Estilos de la cuadrícula
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)'; // Cyan semitransparente
      ctx.lineWidth = 2;
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const labels: string[] = [];

      for (let r = 0; r < ROWS; r++) {
        const rowLetter = String.fromCharCode(65 + r); // A, B, C...
        for (let c = 0; c < COLS; c++) {
          const colNumber = c + 1; // 1, 2, 3...
          const label = `${rowLetter}${colNumber}`;
          labels.push(label);

          const x = c * cellWidth;
          const y = r * cellHeight;

          // Dibujar el borde del cuadrante
          ctx.strokeRect(x, y, cellWidth, cellHeight);

          // Calcular centro
          const cx = x + cellWidth / 2;
          const cy = y + cellHeight / 2;

          // Dibujar fondo oscuro para el texto (alto contraste)
          const textMetrics = ctx.measureText(label);
          const bgWidth = textMetrics.width + 10;
          const bgHeight = 30;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(cx - bgWidth / 2, cy - bgHeight / 2, bgWidth, bgHeight);

          // Dibujar texto
          ctx.fillStyle = '#00FFFF'; // Letra cyan brillante
          ctx.fillText(label, cx, cy);
        }
      }

      // Exportar en JPEG optimizado para la API de Gemini (reduce tokens/tamaño)
      const optimizedBase64 = canvas.toDataURL('image/jpeg', 0.8);
      
      resolve({
        imageBase64: optimizedBase64,
        gridInfo: {
          columns: COLS,
          rows: ROWS,
          cellWidth,
          cellHeight,
          labels
        }
      });
    };
    img.onerror = reject;
    img.src = rawBase64;
  });
}

/**
 * Traduce una coordenada semántica (ej. "C4") a píxeles exactos en pantalla.
 */
export function quadrantToPixels(label: string, screenWidth: number, screenHeight: number, cols = 10, rows = 10): { x: number, y: number } | null {
  const match = label.toUpperCase().trim().match(/^([A-J])([1-9]|10)$/);
  if (!match) return null;

  const rowLetter = match[1];
  const colNumber = parseInt(match[2], 10);

  const r = rowLetter.charCodeAt(0) - 65; // A=0, B=1...
  const c = colNumber - 1;

  const cellWidth = screenWidth / cols;
  const cellHeight = screenHeight / rows;

  return {
    x: Math.round(c * cellWidth + cellWidth / 2),
    y: Math.round(r * cellHeight + cellHeight / 2)
  };
}
