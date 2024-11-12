//
//Written with love by Enguerrand Quilliard
//
struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(4) color : vec4f,
}

@vertex
fn vert_main(@location(0) particlePos : vec2f, @location(1) particleVel : vec2f, @location(2) params : vec2f, @location(3) coord : vec2f) -> VertexOutput {
    //Input Params
    var aspectRatio = params.x;
    var testParam = params.y;

    //Input vertex coord (local)
    let co = vec2(
    coord.x / aspectRatio,
    coord.y
    );

    //Input particle position
    let pos = vec2(
    particlePos.x / aspectRatio,
    particlePos.y
    );

    //Output vertex coord (global)
    var output : VertexOutput;
    output.position = vec4(co + pos, 0.0, 1.0);

    //Output Color
    var pi = 3.14159265359;
    var c = 0.5 * (sin(atan2(co.x, co.y) + pi / 2) + 1);
    output.color = vec4(0.5 * c, 0.75 * c, c, 1.0);

    return output;
}

@fragment
fn frag_main(@location(4) color : vec4f) -> @location(0) vec4f {
    return color;
}
