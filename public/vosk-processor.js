class VoskAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(1024);
        this.pointer = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input && input.length > 0) {
            const channelData = input[0];
            for (let i = 0; i < channelData.length; i++) {
                this.buffer[this.pointer++] = channelData[i];
                if (this.pointer >= 1024) {
                    this.port.postMessage(this.buffer.slice());
                    this.pointer = 0;
                }
            }
        }
        return true;
    }
}

registerProcessor('vosk-audio-processor', VoskAudioProcessor);
