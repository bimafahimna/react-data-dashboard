import React from "react";
import Navbar from "./Navbar/Navbar";
import { getAccessToken } from "@/lib/session";
import Sidebar from "./Navbar/SideNavbar";

const Header = async () => {
  const token = await getAccessToken()

  return <header>
    {/* <Navbar isLoggedIn={token ? true : false} /> */}
    <Sidebar isLoggedIn={token ? true : false} />
  </header>
};

export default Header;
