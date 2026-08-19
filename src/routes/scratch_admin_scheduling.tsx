import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/scratch_admin_scheduling')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/scratch_admin_scheduling"!</div>
}
