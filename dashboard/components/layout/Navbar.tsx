import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-white shadow-md font-sans">

      <div className="text-2xl font-bold text-gray-900">
        <Link href="/">InsightHub</Link>
      </div>

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

      <div className="flex gap-4">
        <Link href="/login">
          <Button variant="ghost">Login</Button>
        </Link>
        <Link href="/signup">
          <Button variant="primary">Sign Up</Button>
        </Link>
      </div>

    </nav>
  );
}
