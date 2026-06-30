import React from "react";
import { getAccessToken } from "@/lib/session";
import Sidebar from "./Navbar/SideNavbar";
import { getStoresForOwner } from "@/lib/repository/stores";

const Header = async () => {
  const token = await getAccessToken();
  const stores = token ? await getStoresForOwner(token.accountId) : [];
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
