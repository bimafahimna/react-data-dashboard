import React from "react";
import { getAccessToken } from "@/lib/session";
import Sidebar from "./Navbar/SideNavbar";
import { getStores } from "@/lib/repository/stores";

const Header = async () => {
  const token = await getAccessToken();
  const stores = await getStores();
  const storeLinks = stores.map((store) => ({
    label: store.name,
    href: `/dashboard/stores/${store.id}`,
  }));

  return (
    <header>
      <Sidebar isLoggedIn={Boolean(token)} stores={storeLinks} />
    </header>
  );
};

export default Header;
