class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(2048); // Paquetes óptimos de 128ms a 16kHz (Ultra Low Latency + Estabilidad WebSocket)
        this.pointer = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.pointer++] = channelData[i];
                if (this.pointer >= 2048) {
                    // Enviar los 128ms continuos al hilo principal para Gemini Live
                    this.port.postMessage(this.buffer.slice());
                    this.pointer = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);


