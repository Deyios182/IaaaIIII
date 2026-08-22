class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 512; // 32ms a 16kHz (Ultra Low Latency para Gemini Live)
        this.buffer = new Float32Array(this.bufferSize);
        this.index = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0];

            // Copiar datos al buffer interno
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.index++] = channelData[i];

                // Cuando el buffer se llena, enviarlo al hilo principal
                if (this.index >= this.bufferSize) {
                    this.port.postMessage(this.buffer); // Enviar copia
                    this.index = 0; // Reiniciar
                }
            }
        }
        return true; // Seguir procesando
    }
}

registerProcessor('audio-processor', AudioProcessor);
