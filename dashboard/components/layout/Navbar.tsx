import React from 'react';
import Link from 'next/link';

/**
 * A basic, structured Navbar component using Tailwind CSS.
 * It is separated into three logical sections: Brand, Links, and Actions.
 */
export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-white shadow-md font-sans">

      {/* 1. Brand or Logo Section */}
      <div className="text-2xl font-bold text-gray-900">
        <Link href="/">MyBrand</Link>
      </div>

      {/* 2. Navigation Links Section */}
      <ul className="flex m-0 p-0 list-none gap-8">
        <li>
          <Link
            href="/home"
            className="text-gray-600 font-medium hover:text-blue-600 transition-colors duration-300"
          >
            Home
          </Link>
        </li>
        <li>
          <Link
            href="/products"
            className="text-gray-600 font-medium hover:text-blue-600 transition-colors duration-300"
          >
            Products
          </Link>
        </li>
        <li>
          <Link
            href="/about"
            className="text-gray-600 font-medium hover:text-blue-600 transition-colors duration-300"
          >
            About Us
          </Link>
        </li>
        <li>
          <Link
            href="/contact"
            className="text-gray-600 font-medium hover:text-blue-600 transition-colors duration-300"
          >
            Contact
          </Link>
        </li>
      </ul>

      {/* 3. Action Buttons Section (e.g., Auth) */}
      <div className="flex gap-4">
        <button className="px-4 py-2 font-semibold text-blue-600 bg-transparent rounded-md hover:bg-gray-100 transition-colors duration-300">
          Login
        </button>
        <button className="px-6 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 active:scale-95 transition-all duration-300">
          Sign Up
        </button>
      </div>

    </nav>
  );
}
