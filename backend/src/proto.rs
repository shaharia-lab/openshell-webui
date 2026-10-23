//! Generated OpenShell gateway API types and the descriptor pool used for
//! reflection (JSON mapping, redaction, the generic call endpoint).

use std::sync::LazyLock;

use prost_reflect::DescriptorPool;

#[allow(clippy::all, clippy::pedantic, missing_docs)]
pub mod openshell {
    pub mod v1 {
        tonic::include_proto!("openshell.v1");
    }
    pub mod datamodel {
        pub mod v1 {
            tonic::include_proto!("openshell.datamodel.v1");
        }
    }
    pub mod sandbox {
        pub mod v1 {
            tonic::include_proto!("openshell.sandbox.v1");
        }
    }
    pub mod options {
        pub mod v1 {
            tonic::include_proto!("openshell.options.v1");
        }
    }
}

pub use openshell::v1 as api;

/// Fully qualified name of the gateway service.
pub const SERVICE: &str = "openshell.v1.OpenShell";

static FILE_DESCRIPTOR_SET: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/openshell_descriptor.bin"));

/// Descriptor pool with every OpenShell message, service and extension.
pub static POOL: LazyLock<DescriptorPool> =
    LazyLock::new(|| DescriptorPool::decode(FILE_DESCRIPTOR_SET).expect("embedded descriptor set is valid"));
