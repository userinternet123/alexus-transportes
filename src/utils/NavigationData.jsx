// utils/navigationHelper.js

export const navigateToSubmenu = (navigate, menu, submenu, data, onFormSelected = null) => {
  const navigationData = {
    menuLabel: menu.label,
    type: submenu.component,
    submenuLabel: submenu.label,
    name: submenu.name,
    module: submenu.module,
    title: submenu.title,
    button: submenu.button,
    msg: submenu.msg,
    filtro: menu.filtro,
  }

  sessionStorage.setItem('selectedForm', JSON.stringify(navigationData))

  if (onFormSelected) {
    onFormSelected(submenu.name)
  }

  navigate(submenu.path, {
    state: { ...navigationData, data: { ...data } },
  })
}
