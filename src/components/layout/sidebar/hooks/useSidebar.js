import { useState } from 'react'

export const useSidebar = () => {
  const [openMenu, setOpenMenu] = useState(null)

  const toggleMenu = (menu) => {
    setOpenMenu((prev) => (prev === menu ? null : menu))
  }

  return {
    openMenu,
    toggleMenu,
  }
}
