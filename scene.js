function Texture(gl) {
    this.gl = gl;
}

Texture.prototype = {
    load: function(imageSrc, loadedCallback) {
        var gl = this.gl;
        this.image = new Image();
        this.image.onload = function() {
            this.width = this.image.width;
            this.height = this.image.height;
            this.upload();
            if(loadedCallback) {loadedCallback(this);}
        }.bind(this);
        this.image.src = imageSrc;
    },
    upload: function() {
        var gl = this.gl;
        this.textureObj = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.textureObj);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);                
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindTexture(gl.TEXTURE_2D, null);
    },
    bindToUniform: function(program, textureLocation, uniformName) {
        var gl = this.gl;
        this.textureLocation = textureLocation;
        var textureLocationName = 'TEXTURE' + this.textureLocation;
        gl.activeTexture(gl[textureLocationName]);
        gl.bindTexture(gl.TEXTURE_2D, this.textureObj);
        
        this.uniformPointer = gl.getUniformLocation(program.program, uniformName);
        gl.uniform1i(this.uniformPointer, this.textureLocation);
    }
};

function GLSLProgram(gl, pMatrixName, mvMatrixName) {
    this.gl = gl;
    this.pMatrixName = pMatrixName;
    this.mvMatrixName = mvMatrixName;
}

GLSLProgram.prototype = {
    compileAndLink: function(vertexShaderSource, fragmentShaderSource) {
        var gl = this.gl;
        this.vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(this.vertexShader, vertexShaderSource);
        gl.compileShader(this.vertexShader);
        if(!gl.getShaderParameter(this.vertexShader, gl.COMPILE_STATUS)) {
            throw new Error('could not compile vertex shader : '+gl.getShaderInfoLog(this.vertexShader));
        }
        this.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(this.fragmentShader, fragmentShaderSource);
        gl.compileShader(this.fragmentShader);
        if(!gl.getShaderParameter(this.fragmentShader, gl.COMPILE_STATUS)) {
            throw new Error('could not compile fragment shader : '+gl.getShaderInfoLog(this.fragmentShader));
        }
        this.program = gl.createProgram();
        gl.attachShader(this.program, this.fragmentShader);
        gl.attachShader(this.program, this.vertexShader);
        gl.linkProgram(this.program);
        if(!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error('could not link shaders: '+gl.getProgramInfoLog(this.program));
        }
        gl.validateProgram(this.program);
        if(!gl.getProgramParameter(this.program, gl.VALIDATE_STATUS)) {
            throw new Error('could not validate shaders: '+gl.getProgramInfoLog(this.program));
        }
    },
    use: function() {
        return this.gl.useProgram(this.program);
    },
    getAttribLocation: function(name) {
        return this.gl.getAttribLocation(this.program, name);
    },
    getUniformLocation: function(name) {
        return this.gl.getUniformLocation(this.program, name);
    },
    attachTexture: function(texture, textureLocation, uniformName) {
        return texture.bindToUniform(this, textureLocation, uniformName);
    },
    attachBuffer: function(buffer, attributeName) {
        return buffer.bindToAttribute(this, attributeName);
    },
    createMesh: function() {
        return new Mesh(this);
    }
};

function Buffer(gl, geometry, size) {
    this.gl = gl;
    this.size = size;
    this.length = geometry.length;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry), gl.STATIC_DRAW);
}

Buffer.prototype = {
    bindToAttribute: function(program, attributeName) {
        var gl = this.gl;
        var pointer = gl.getAttribLocation(program.program, attributeName);
        gl.enableVertexAttribArray(pointer);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.vertexAttribPointer(pointer, this.size, gl.FLOAT, false, 0, 0);
    }
};

function Mesh(program) {
    this.program = program;
    this.buffers = {};
    this.textures = {};
}

Mesh.prototype = {
    attachBuffer: function(buffer, attributeName) {
        this.buffers[attributeName] = buffer;
    },
    setVertexBuffer: function(buffer, attributeName) {
        this.attachBuffer(buffer, attributeName);
        this.faceCount = buffer.length / buffer.size;
    },
    attachTexture: function(texture, textureLocation, uniformName) {
        this.textures[uniformName] = {location: textureLocation, texture: texture};
    },
    draw: function() {
        var gl = this.program.gl;
        Scene.useProgram(this.program);
        Object.keys(this.buffers).forEach(function(bufferName) {
            this.program.attachBuffer(this.buffers[bufferName], bufferName);
        }, this);
        Object.keys(this.textures).forEach(function(textureName) {
            var textureDesc = this.textures[textureName];
            this.program.attachTexture(textureDesc.texture, textureDesc.location, textureName);
        }, this);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.faceCount);
    }
};

var Scene = {
    init: function(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.gl = canvas.getContext('experimental-webgl');
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        
        var errorMap = {};
        errorMap[Scene.gl.OUT_OF_MEMORY] = 'OUT_OF_MEMORY';
        errorMap[Scene.gl.INVALID_ENUM] = 'INVALID_ENUM';
        errorMap[Scene.gl.INVALID_OPERATION] = 'INVALID_OPERATION';
        errorMap[Scene.gl.INVALID_FRAMEBUFFER_OPERATION] = 'INVALID_FRAMEBUFFER_OPERATION';
        errorMap[Scene.gl.INVALID_VALUE] = 'INVALID_VALUE';
        errorMap[Scene.gl.NO_ERROR] = 'NO_ERROR';
        errorMap[Scene.gl.CONTEXT_LOST_WEBGL] = 'CONTEXT_LOST_WEBGL';
        this.errorMap = errorMap;
    },
    setPerspectiveCamera: function(far, near, angle) {
        this.pMatrix = mat4.create();
        mat4.perspective(angle, this.canvas.width / this.canvas.height, near, far, this.pMatrix);
    },
    useProgram: function(program) {
        program.use();
        var gl = this.gl;
        this.program = program;
        var pMatrixPointer = program.getUniformLocation(program.pMatrixName);
        gl.uniformMatrix4fv(pMatrixPointer, false, this.pMatrix);
        
        var mvMatrix = this.matrixStack[this.matrixStack.length - 1];
        var mvMatrixPointer = this.program.getUniformLocation(this.program.mvMatrixName);
        gl.uniformMatrix4fv(mvMatrixPointer, false, mvMatrix);
    },
    clear: function() {
        var gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        //clear mv stack
        var mvMatrix = mat4.create();
        mat4.identity(mvMatrix);
        this.matrixStack = [mvMatrix];
    },
    rotate: function(angle) {
        
    },
    translate: function(x, y, z) {
        z = z || 0.0;
        mat4.translate(this.matrixStack[this.matrixStack.length - 1], [x, y, z]);
    },
    save: function() {
        var mvMatrix = this.matrixStack[this.matrixStack.length - 1];
        var copy = mat4.create();
        mat4.set(mvMatrix, copy);
        this.matrixStack.push(mvMatrix);
    },
    restore: function() {
        return this.matrixStack.pop();
    },
    createVertexBuffer: function(vertices) {
        return new Buffer(this.gl, vertices, 3);
    },
    createTextureCoordinateBuffer: function(texCoords) {
        return new Buffer(this.gl, texCoords, 2);
    },
    loadTexture: function(imageSrc, loadedCallback) {
        var texture = new Texture(this.gl);
        texture.load(imageSrc, loadedCallback);
        return texture;
    },
    createProgram: function(vertexShaderSource, fragmentShaderSource, pMatrixName, mvMatrixName) {
        var program = new GLSLProgram(this.gl, pMatrixName, mvMatrixName);
        program.compileAndLink(vertexShaderSource, fragmentShaderSource);
        return program;
    },
    checkErrors: function() {
        var error = this.gl.getError();
        if(error === this.gl.NO_ERROR) {
            return;
        }
        throw new Error('WebGL error: '+this.errorMap[error]);
    }
};