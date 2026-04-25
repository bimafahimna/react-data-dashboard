"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { logoutAction } from "./action";

export default function Navbar(props: { isLoggedIn: boolean }) {
  const session = props.isLoggedIn;

  const menu: { ref: string; label: string }[] = [
    { ref: "/home", label: "Home" },
    { ref: "/products", label: "Products" },
    { ref: "/about", label: "About Us" },
    { ref: "/contact", label: "Contact" },
  ];

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-white shadow-md font-sans">
      <div className="text-2xl font-bold text-gray-900">
        <Link href="/">InsightHub</Link>
      </div>

      <ul className="flex m-0 p-0 list-none gap-8">
        {menu.map((item) => (
          <li key={item.ref}>
            <Link
              href={"/dashboard" + item.ref}
              className="text-gray-600 font-medium hover:text-blue-600 transition-colors duration-300"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>

      {session ? (
        <div className="flex gap-4">
          <form action={logoutAction}>
            <Button variant="ghost" type="submit">
              Logout
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex gap-4">
          <Link href="/login">
            <Button variant="ghost">Login</Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary">Sign Up</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
