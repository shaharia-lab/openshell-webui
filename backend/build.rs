//! Generates the OpenShell gateway gRPC client and a descriptor set from the
//! protos copied from upstream (see proto/SOURCE_COMMIT). The descriptor set
//! drives the reflection-based parts of the backend: JSON encoding, secret
//! redaction and the allowlisted generic call endpoint.

use std::{env, path::PathBuf};

const PROTOS: [&str; 4] = ["openshell.proto", "datamodel.proto", "sandbox.proto", "options.proto"];

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?).join("proto");
    for p in PROTOS {
        println!("cargo:rerun-if-changed={}", proto_dir.join(p).display());
    }

    let mut config = tonic_prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    let includes = [proto_dir.clone(), protoc_bin_vendored::include_path()?];

    let descriptor = PathBuf::from(env::var("OUT_DIR")?).join("openshell_descriptor.bin");
    // The server is generated too (with default "unimplemented" stubs) so
    // integration tests can run a fake gateway that implements a few methods.
    tonic_prost_build::configure()
        .build_client(true)
        .build_server(true)
        .generate_default_stubs(true)
        .file_descriptor_set_path(&descriptor)
        .compile_with_config(config, &PROTOS.map(|p| proto_dir.join(p)), &includes)?;
    Ok(())
}
