import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/wastage-rules')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/admin/wastage-rules"!</div>
}
