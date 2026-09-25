class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(2048); // Canal 0 (Mic) para VAD
        this.mixBuffer = new Float32Array(2048); // Canal 1 (Mic+Sys) para Gemini
        this.pointer = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0]; // Mic
            const mixData = input.length > 1 ? input[1] : input[0]; // Mixer
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.pointer] = channelData[i];
                this.mixBuffer[this.pointer] = mixData[i];
                this.pointer++;
                if (this.pointer >= 2048) {
                    this.port.postMessage({
                        pcm: this.buffer.slice(), // RAW Mic para VAD
                        mixPcm: this.mixBuffer.slice(), // Mezclado para Gemini
                        timestamp: currentTime
                    });
                    this.pointer = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor);

