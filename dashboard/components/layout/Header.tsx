import React from "react";
import Navbar from "./Navbar/Navbar";
import { getAccessToken } from "@/lib/session";

const Header = async () => {
  const token = await getAccessToken()

  return <header>
    <Navbar isLoggedIn={token ? true : false} />
  </header>
};

export default Header;
