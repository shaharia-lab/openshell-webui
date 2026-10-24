import type * as pb from '@/gen/openshell'
import type * as sb from '@/gen/sandbox'

// Request and response types of the gateway methods the backend allowlists for
// POST /api/gw/{gw}/call/{method}. The backend sets workspace_scope and
// request_id, so callers leave them out.

type Req<T> = Omit<T, 'workspace_scope' | 'request_id'>

export interface RpcMap {
  // Sandboxes
  CreateSandbox: [Req<pb.CreateSandboxRequest>, pb.SandboxResponse]
  StartSandbox: [Req<pb.StartSandboxRequest>, pb.SandboxResponse]
  StopSandbox: [Req<pb.StopSandboxRequest>, pb.SandboxResponse]
  DeleteSandbox: [Req<pb.DeleteSandboxRequest>, pb.DeleteSandboxResponse]
  AttachSandboxProvider: [Req<pb.AttachSandboxProviderRequest>, pb.AttachSandboxProviderResponse]
  DetachSandboxProvider: [Req<pb.DetachSandboxProviderRequest>, pb.DetachSandboxProviderResponse]
  ListSandboxProviders: [Req<pb.ListSandboxProvidersRequest>, pb.ListSandboxProvidersResponse]
  GetSandboxProviderStatus: [
    Req<pb.GetSandboxProviderStatusRequest>,
    pb.GetSandboxProviderStatusResponse,
  ]
  // Policy and settings
  UpdateConfig: [Req<pb.UpdateConfigRequest>, pb.UpdateConfigResponse]
  GetSandboxPolicyStatus: [Req<pb.GetSandboxPolicyStatusRequest>, pb.GetSandboxPolicyStatusResponse]
  GetGatewayConfig: [sb.GetGatewayConfigRequest, sb.GetGatewayConfigResponse]
  // Policy proposals
  GetDraftPolicy: [Req<pb.GetDraftPolicyRequest>, pb.GetDraftPolicyResponse]
  GetDraftHistory: [Req<pb.GetDraftHistoryRequest>, pb.GetDraftHistoryResponse]
  ApproveDraftChunk: [Req<pb.ApproveDraftChunkRequest>, pb.ApproveDraftChunkResponse]
  RejectDraftChunk: [Req<pb.RejectDraftChunkRequest>, pb.RejectDraftChunkResponse]
  ApproveAllDraftChunks: [Req<pb.ApproveAllDraftChunksRequest>, pb.ApproveAllDraftChunksResponse]
  EditDraftChunk: [Req<pb.EditDraftChunkRequest>, pb.EditDraftChunkResponse]
  UndoDraftChunk: [Req<pb.UndoDraftChunkRequest>, pb.UndoDraftChunkResponse]
  ClearDraftChunks: [Req<pb.ClearDraftChunksRequest>, pb.ClearDraftChunksResponse]
  // Providers and profiles
  GetProvider: [Req<pb.GetProviderRequest>, pb.ProviderResponse]
  GetProviderProfile: [Req<pb.GetProviderProfileRequest>, pb.ProviderProfileResponse]
  CreateProvider: [Req<pb.CreateProviderRequest>, pb.ProviderResponse]
  UpdateProvider: [Req<pb.UpdateProviderRequest>, pb.ProviderResponse]
  DeleteProvider: [Req<pb.DeleteProviderRequest>, pb.DeleteProviderResponse]
  RotateProviderCredential: [
    Req<pb.RotateProviderCredentialRequest>,
    pb.RotateProviderCredentialResponse,
  ]
  GetProviderRefreshStatus: [
    Req<pb.GetProviderRefreshStatusRequest>,
    pb.GetProviderRefreshStatusResponse,
  ]
  ConfigureProviderRefresh: [
    Req<pb.ConfigureProviderRefreshRequest>,
    pb.ConfigureProviderRefreshResponse,
  ]
  DeleteProviderRefresh: [Req<pb.DeleteProviderRefreshRequest>, pb.DeleteProviderRefreshResponse]
  LintProviderProfiles: [Req<pb.LintProviderProfilesRequest>, pb.LintProviderProfilesResponse]
  ImportProviderProfiles: [Req<pb.ImportProviderProfilesRequest>, pb.ImportProviderProfilesResponse]
  UpdateProviderProfiles: [Req<pb.UpdateProviderProfilesRequest>, pb.UpdateProviderProfilesResponse]
  DeleteProviderProfile: [Req<pb.DeleteProviderProfileRequest>, pb.DeleteProviderProfileResponse]
  // Templates and services
  GetSandboxTemplate: [Req<pb.GetSandboxTemplateRequest>, pb.SandboxTemplateResponse]
  GetService: [Req<pb.GetServiceRequest>, pb.ServiceEndpointResponse]
  CreateSandboxTemplate: [Req<pb.CreateSandboxTemplateRequest>, pb.SandboxTemplateResponse]
  DeleteSandboxTemplate: [Req<pb.DeleteSandboxTemplateRequest>, pb.DeleteSandboxTemplateResponse]
  ExposeService: [Req<pb.ExposeServiceRequest>, pb.ServiceEndpointResponse]
  DeleteService: [Req<pb.DeleteServiceRequest>, pb.DeleteServiceResponse]
  // Workspaces and members
  GetWorkspace: [Req<pb.GetWorkspaceRequest>, pb.GetWorkspaceResponse]
  CreateWorkspace: [Req<pb.CreateWorkspaceRequest>, pb.CreateWorkspaceResponse]
  DeleteWorkspace: [Req<pb.DeleteWorkspaceRequest>, pb.DeleteWorkspaceResponse]
  ListWorkspaceMembers: [Req<pb.ListWorkspaceMembersRequest>, pb.ListWorkspaceMembersResponse]
  AddWorkspaceMember: [Req<pb.AddWorkspaceMemberRequest>, pb.AddWorkspaceMemberResponse]
  RemoveWorkspaceMember: [Req<pb.RemoveWorkspaceMemberRequest>, pb.RemoveWorkspaceMemberResponse]
}

export type RpcMethod = keyof RpcMap
export type RpcRequest<M extends RpcMethod> = RpcMap[M][0]
export type RpcResponse<M extends RpcMethod> = RpcMap[M][1]
