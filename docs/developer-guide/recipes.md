# Recipes

This page gives step-by-step instructions for common changes. Each recipe names the files to touch and shows a short snippet in the repo's style. Names in angle brackets, such as `<Method>`, are placeholders.

Finish every recipe with `make lint test`.

## Expose a new gateway method

Use this when the browser needs to call a unary gateway method that is not allowlisted yet.

1. Check the method is safe to expose. It must not issue tokens, export credentials, or belong to supervisors or peers. See [blocked RPCs](upstream-openshell.md#rpcs-that-stay-blocked).
2. Add it to `ALLOWED` in `backend/src/rpcs.rs`, in the matching group. Mark it `Write` if it changes anything:

   ```rust
   // Templates and services.
   ("GetSandboxTemplate", Read),
   ("CreateSandboxTemplate", Write),
   ```

3. Add its types to `RpcMap` in `frontend/src/api/rpc.ts`. Wrap the request in `Req<>` when it has `workspace_scope` or `request_id`:

   ```ts
   GetSandboxTemplate: [Req<pb.GetSandboxTemplateRequest>, pb.SandboxTemplateResponse]
   ```

4. Call it from a component. Writes use `useRpc`; reads use `useGwCall`:

   ```tsx
   const create = useRpc(gw, 'CreateSandboxTemplate', {
     toastErrors: false,
     success: (_, v) => `Template ${v.body.template?.metadata?.name} created.`,
   })
   create.mutate({ ws, body: { template } }, { onSuccess: onDone })

   const tpl = useGwCall(gw, 'GetSandboxTemplate', ws, { name })
   ```

5. If the response has a field the UI should not show, check that its proto marks it `(openshell.options.v1.secret)`. Redaction then happens on its own.
6. For a write, add or extend a test in `backend/tests/api.rs` when the method needs special handling (workspace, `global`, audit target).

> [!NOTE]
> Keep `RpcMap` in step with `ALLOWED`: every allowlisted method should have an entry, so the frontend can call it with full types.

## Add a read route

Use this for a read the UI polls, when a plain `GET` URL is clearer than a `POST .../call/...`.

1. Add one line to `routes()` in `backend/src/http/reads.rs` with a factory. The existing templates route is the pattern:

   ```rust
   .route("/api/gw/{gw}/templates", list("ListSandboxTemplates", "templates", true))
   // per sandbox: sandbox_get("<Method>", "<name field>")
   // no arguments: unary("<Method>")
   ```

2. If the response needs shaping, write a handler like `effective_policy` instead. Validate path segments with `sandbox_name` and the workspace with `ScopeQuery::workspace`, and return `ProtoJson`.
3. Add a hook in `frontend/src/api/queries.ts`:

   ```ts
   export const useTemplates = (gw: string, ws: string) =>
     useGwGet<pb.ListSandboxTemplatesResponse>(gw, 'templates', { workspace: ws })
   ```

4. Add a default MSW handler to `frontend/src/test/server.ts` if most pages will hit the route.
5. Add the route to the table in [Backend](backend.md#api-routes) and in `backend/README.md`.

## Add a page

1. Create a feature folder: `frontend/src/features/<area>/<area>-page.tsx`. Export the page as `default`:

   ```tsx
   export default function TemplatesPage() {
     useDocumentTitle('Templates')
     const { gw, ws } = useScope()
     const templates = useTemplates(gw, ws)
     return (
       <>
         <PageHeader title="Templates" />
         <QueryView query={templates}>
           {(data) => <DataTable data={data.templates ?? []} columns={columns} />}
         </QueryView>
       </>
     )
   }
   ```

2. Add a lazy route in `frontend/src/app/routes.tsx`:

   ```tsx
   { path: 'templates', lazy: page(() => import('@/features/templates/templates-page')) },
   ```

3. Add an entry to `NAV` in `frontend/src/components/layout/nav.ts`. The sidebar and the command palette's "Pages" group both read `NAV`:

   ```ts
   { to: '/templates', label: 'Templates', icon: LayoutTemplateIcon },
   ```

4. For a page-specific palette action, add a `CommandItem` to the "Actions" group in `frontend/src/components/layout/command-palette.tsx`.
5. Add a page test in `frontend/src/features/<area>/__tests__/` with `renderApp`.

`QueryView` (`frontend/src/components/common/query-view.tsx`) renders the loading and error states and passes the data to its child function.

## Add a form dialog

1. Create `frontend/src/features/<area>/<thing>-dialog.tsx`. Define a zod schema; reuse schemas from `frontend/src/lib/validation.ts`:

   ```tsx
   const schema = z.object({ name: nameSchema, image: z.string().trim() })
   type Values = z.infer<typeof schema>
   ```

2. Render `FormDialog`, and put the form in a child component so its state resets on every open:

   ```tsx
   export function CreateThingDialog({ gw, ws, open, onOpenChange }: Props) {
     return (
       <FormDialog open={open} onOpenChange={onOpenChange} title="New thing">
         <ThingForm gw={gw} ws={ws} onDone={() => onOpenChange(false)} />
       </FormDialog>
     )
   }
   ```

3. In the form, use `useRpc` with `toastErrors: false`, and pass `pending` and `error` to `DialogForm`:

   ```tsx
   const create = useRpc(gw, '<Method>', { toastErrors: false, success: 'Created.' })
   const { control, handleSubmit } = useForm<Values>({ resolver: zodResolver(schema), defaultValues })
   const submit = handleSubmit((v) => create.mutate({ ws, body: toRequest(v) }, { onSuccess: onDone }))
   return (
     <DialogForm onSubmit={submit} submitLabel="Create" pending={create.isPending} error={create.error}>
       <FormField control={control} name="name" label="Name"
         render={({ field, id, invalid }) => <Input {...field} id={id} aria-invalid={invalid || undefined} />} />
     </DialogForm>
   )
   ```

4. Move `toRequest` into its own module when it has rules, and unit-test it. `frontend/src/features/sandboxes/create/request.ts` is the model.
5. Open the dialog from a `WriteButton`, so it is disabled in read-only mode.
6. Compare the request with the CLI and server validation. See [feature parity](upstream-openshell.md#check-feature-parity-with-the-cli).

## Add a backend domain module

Put logic that is not HTTP plumbing in its own module outside `http/`, like `exec.rs`, `sandbox_fs.rs` and `local/`.

1. Create `backend/src/<module>.rs` with a `//!` doc comment that says what it does.
2. Register it in `backend/src/lib.rs`: `pub mod <module>;`.
3. Take what it needs as arguments (a `&GatewayClient`, a `Target`, plain values). Return `Result<_, ApiError>`.
4. Add unit tests in a `#[cfg(test)] mod tests` block in the same file.
5. Call it from a thin handler in `backend/src/http/`. For writes: check `s.read_only`, run the operation, then `s.audit.record(...)`, as `write_op` in `backend/src/http/files.rs` does.
6. Add an integration test in `backend/tests/api.rs` if it talks to the gateway.

## Refresh protos

1. Update your OpenShell checkout to the commit or tag you want.
2. Run:

   ```bash
   make proto OPENSHELL_SRC=/path/to/OpenShell
   ```

3. Review `git diff backend/proto/ frontend/src/gen/`. Check `backend/proto/SOURCE_COMMIT`.
4. Run `make lint test` and fix type errors in the frontend.
5. Follow the [after an upstream release](upstream-openshell.md#after-an-upstream-release) checklist.

## Related

- [Backend](backend.md)
- [Frontend](frontend.md)
- [Upstream OpenShell](upstream-openshell.md)
- [Testing](testing.md)
