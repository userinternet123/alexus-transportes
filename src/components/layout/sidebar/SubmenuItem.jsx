function SubmenuItem({ children, onClick }) {
  return (
    <a onClick={onClick} className="submenu-item block cursor-pointer">
      {children}
    </a>
  )
}

export default SubmenuItem
