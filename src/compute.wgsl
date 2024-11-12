//
//Written with love by Enguerrand Quilliard
//
struct Particle {
    pos : vec2f,
    vel : vec2f,
    params : vec2f,
}

struct SimParams {
    deltaT : f32,
    worldGravity : f32,
    particleRadius : f32,
    particleDamping : f32,
}

struct Particles {
    particles : array<Particle>,
}

@binding(0) @group(0) var<uniform> params : SimParams;
@binding(1) @group(0) var<storage, read> particlesA : Particles;
@binding(2) @group(0) var<storage, read_write> particlesB : Particles;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3u)
{
    //Global Simulation params
    var deltaT = params.deltaT;
    var worldGravity = params.worldGravity;
    var particleRadius = params.particleRadius;
    var particleDamping = params.particleDamping;

    //This particle params
    var index = GlobalInvocationID.x;
    var vPos = particlesA.particles[index].pos;
    var vVel = particlesA.particles[index].vel;
    var vRatio = particlesA.particles[index].params.x;
    var vTestParam = particlesA.particles[index].params.y;

    //Compute over neighbours
    for (var i = 0u; i < arrayLength(&particlesA.particles); i++)
    {
        //Ignore self
        if (i == index)
        {
            continue;
        }
        //Retreive neighbour state
        var pos = particlesA.particles[i].pos;
        var vel = particlesA.particles[i].vel;
        var ratio = particlesA.particles[i].params.x;
        var testParam = particlesA.particles[i].params.y;

        //Compute
        var d = distance(pos, vPos);
        if(d > 0.0 && d < 2 * particleRadius)
        {
            vVel += 20.0 * (vPos - pos) * (2 * particleRadius - d) / d;
            vVel *= 0.98;
        }
    }

    //Kinematic update
    vVel.y += deltaT * worldGravity;
    vPos = vPos + (vVel * deltaT);

    //Wrap around boundaries
    if (vPos.x < -vRatio + particleRadius)
    {
        vPos.x = -vRatio + particleRadius;
        vVel.x *= -1.0;
        vVel *= particleDamping;
    }
    if (vPos.x > vRatio - particleRadius)
    {
        vPos.x = vRatio - particleRadius;
        vVel.x *= -1.0;
        vVel *= particleDamping;
    }
    if (vPos.y < -1.0 + particleRadius)
    {
        vPos.y = -1.0 + particleRadius;
        vVel.y *= -1.0;
        vVel *= particleDamping;
    }
    if (vPos.y > 1.0 - particleRadius)
    {
        vPos.y = 1.0 - particleRadius;
        vVel.y *= -1.0;
        vVel *= particleDamping;
    }

    //Write back
    particlesB.particles[index].pos = vPos;
    particlesB.particles[index].vel = vVel;
}
