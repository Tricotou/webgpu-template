//
// Written with love by Enguerrand Quilliard
//
import renderWGSL from "./render.wgsl?raw";
import computeWGSL from "./compute.wgsl?raw";

// GLOBALS
const testParam = 0.5;
const clearColor = [0, 0.1, 0.2, 1];
const particleTotal = 500;
const particleRenderFan = 12;
const deltaT = 0.01;
const worldGravity = -2.0;
const particleRadius = 0.03;
const particleDamping = 0.5;

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
const adapter = await navigator.gpu?.requestAdapter();
if (adapter) {
    // WebGPU context
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu") as GPUCanvasContext;
    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    const aspectRatio = canvas.width / canvas.height;
    context.configure({
        device,
        format: presentationFormat,
    });

    // Default render pass
    interface CustomGPURenderPassDescriptor extends Omit<GPURenderPassDescriptor, "colorAttachments"> {
        colorAttachments: GPURenderPassColorAttachment[];
    }
    const renderPassDescriptor: CustomGPURenderPassDescriptor = {
        colorAttachments: [
            {
                view: undefined as unknown as GPUTextureView,
                clearValue: clearColor,
                loadOp: "clear" as const,
                storeOp: "store" as const,
            },
        ],
    };

    // ------------------------------------------------------------------------
    // ---------------------------  SIMULATION PARAMS -------------------------
    // ------------------------------------------------------------------------
    let simParams: number[] = [];
    simParams.push(deltaT);
    simParams.push(worldGravity);
    simParams.push(particleRadius);
    simParams.push(particleDamping);

    const simParamBufferSize = simParams.length * Float32Array.BYTES_PER_ELEMENT;
    const simParamBuffer = device.createBuffer({
        size: simParamBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    function updateSimParams() {
        device.queue.writeBuffer(simParamBuffer, 0, new Float32Array(simParams));
    }
    updateSimParams();

    // ------------------------------------------------------------------------
    // ----------------------------  CREATE PARTICLES -------------------------
    // ------------------------------------------------------------------------

    // Particle Geometry (Triangle Fan)
    let vertices = [];
    const delta = (2.0 * Math.PI) / particleRenderFan;
    for (let i = 0; i < particleRenderFan; i++) {
        vertices.push(0.0);
        vertices.push(0.0);
        vertices.push(particleRadius * Math.cos(i * delta));
        vertices.push(particleRadius * Math.sin(i * delta));
        vertices.push(particleRadius * Math.cos((i + 1) * delta));
        vertices.push(particleRadius * Math.sin((i + 1) * delta));
    }
    const vertexBufferData = new Float32Array(vertices);
    const particleVertexBuffer = device.createBuffer({
        size: vertexBufferData.byteLength,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(particleVertexBuffer.getMappedRange()).set(vertexBufferData);
    particleVertexBuffer.unmap();

    // Particle instances (position, speed, params)
    const initialParticleData = new Float32Array(particleTotal * 6);
    for (let i = 0; i < particleTotal; i++) {
        // Position
        initialParticleData[6 * i + 0] = aspectRatio * (2 * (Math.random() - 0.5));
        initialParticleData[6 * i + 1] = 2 * (Math.random() - 0.5);
        // Speed
        initialParticleData[6 * i + 2] = 0.0;
        initialParticleData[6 * i + 3] = 0.0;
        // aspectRatio & testParam
        initialParticleData[6 * i + 4] = aspectRatio;
        initialParticleData[6 * i + 5] = testParam;
    }

    // ------------------------------------------------------------------------
    // ----------------------------  RENDER PIPELINE --------------------------
    // ------------------------------------------------------------------------
    const renderShaderModule = device.createShaderModule({ code: renderWGSL });
    const renderPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: renderShaderModule,
            buffers: [
                {
                    // Instanced particles buffer
                    arrayStride: 6 * Float32Array.BYTES_PER_ELEMENT,
                    stepMode: "instance",
                    attributes: [
                        {
                            // Instance position
                            shaderLocation: 0,
                            offset: 0,
                            format: "float32x2",
                        },
                        {
                            // Instance velocity
                            shaderLocation: 1,
                            offset: 2 * Float32Array.BYTES_PER_ELEMENT,
                            format: "float32x2",
                        },
                        {
                            // Instance params
                            shaderLocation: 2,
                            offset: 4 * Float32Array.BYTES_PER_ELEMENT,
                            format: "float32x2",
                        },
                    ],
                },
                {
                    // Vertex buffer
                    arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT,
                    stepMode: "vertex",
                    attributes: [
                        {
                            shaderLocation: 3,
                            offset: 0,
                            format: "float32x2",
                        },
                    ],
                },
            ],
        },
        fragment: {
            module: renderShaderModule,
            targets: [
                {
                    format: presentationFormat,
                },
            ],
        },
        primitive: {
            topology: "triangle-list",
        },
    });

    // ------------------------------------------------------------------------
    // ---------------------------  COMPUTE PIPELINE --------------------------
    // ------------------------------------------------------------------------
    const computePipeline = device.createComputePipeline({
        layout: "auto",
        compute: {
            module: device.createShaderModule({
                code: computeWGSL,
            }),
        },
    });
    const computePassDescriptor: GPUComputePassDescriptor = {};

    const particleBuffers: GPUBuffer[] = new Array(2);
    const particleBindGroups: GPUBindGroup[] = new Array(2);
    for (let i = 0; i < 2; ++i) {
        particleBuffers[i] = device.createBuffer({
            size: initialParticleData.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
            mappedAtCreation: true,
        });
        new Float32Array(particleBuffers[i].getMappedRange()).set(initialParticleData);
        particleBuffers[i].unmap();
    }
    for (let i = 0; i < 2; ++i) {
        particleBindGroups[i] = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: simParamBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: particleBuffers[i],
                        offset: 0,
                        size: initialParticleData.byteLength,
                    },
                },
                {
                    binding: 2,
                    resource: {
                        buffer: particleBuffers[(i + 1) % 2],
                        offset: 0,
                        size: initialParticleData.byteLength,
                    },
                },
            ],
        });
    }

    // ------------------------------------------------------------------------
    // -------------------------------  MAIN LOOP -----------------------------
    // ------------------------------------------------------------------------
    let t = 0;
    function frame() {
        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();

        const commandEncoder = device.createCommandEncoder();
        // GPGPU compute
        {
            const passEncoder = commandEncoder.beginComputePass(computePassDescriptor);
            passEncoder.setPipeline(computePipeline);
            passEncoder.setBindGroup(0, particleBindGroups[t % 2]);
            passEncoder.dispatchWorkgroups(Math.ceil(particleTotal / 64));
            passEncoder.end();
        }
        // Render compute
        {
            const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
            passEncoder.setPipeline(renderPipeline);
            passEncoder.setVertexBuffer(0, particleBuffers[(t + 1) % 2]);
            passEncoder.setVertexBuffer(1, particleVertexBuffer);
            passEncoder.draw(3 * particleRenderFan, particleTotal, 0, 0);
            passEncoder.end();
        }
        device.queue.submit([commandEncoder.finish()]);
        ++t;
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
} else {
    console.error("WebGPU not available");
}
