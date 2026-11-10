import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router'
import { describe, expect, it } from 'vitest'

import { LinkTab } from '../link-tab'
import { Tabs, TabsList } from '@/components/ui/tabs'

function Page() {
  const tab = useParams().tab ?? 'one'
  return (
    <Tabs value={tab}>
      <TabsList>
        <LinkTab value="one" to="/p">
          One
        </LinkTab>
        <LinkTab value="two" to="/p/two">
          Two
        </LinkTab>
      </TabsList>
    </Tabs>
  )
}

describe('LinkTab', () => {
  it('is a link with an href, still a tab, and navigates once on click', async () => {
    const router = createMemoryRouter(
      [
        { path: '/p', element: <Page /> },
        { path: '/p/:tab', element: <Page /> },
      ],
      { initialEntries: ['/p'] },
    )
    render(<RouterProvider router={router} />)

    const two = screen.getByRole('tab', { name: 'Two' })
    expect(two.tagName).toBe('A')
    expect(two).toHaveAttribute('href', '/p/two')
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(two)
    expect(router.state.location.pathname).toBe('/p/two')
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true')

    // One history entry for the click, not two.
    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/p')
  })
})
