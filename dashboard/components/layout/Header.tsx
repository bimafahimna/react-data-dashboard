import React from "react";
import { getAccessToken } from "@/lib/session";
import { getAdminActor } from "@/lib/auth/requireAdmin";
import Sidebar from "./Navbar/SideNavbar";
import { getStoresForOwner } from "@/lib/repository/stores";

const Header = async () => {
  const token = await getAccessToken();
  const [stores, adminActor] = await Promise.all([
    token ? getStoresForOwner(token.accountId) : Promise.resolve([]),
    token ? getAdminActor() : Promise.resolve(null),
  ]);
  const storeLinks = stores.map((store) => ({
    label: store.name,
    href: `/dashboard/stores/${store.id}`,
  }));

  return (
    <header>
      <Sidebar
        isLoggedIn={Boolean(token)}
        stores={storeLinks}
        isAdmin={Boolean(adminActor)}
      />
    </header>
  );
};

export default Header;
