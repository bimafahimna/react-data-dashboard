"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { logoutAction } from "@/app/(auth)/logoutAction";
import {
    Home,
    BarChart3,
    MessageCircle,
    Calendar,
    Settings,
    HelpCircle,
    Store,
} from "lucide-react";

export default function Sidebar({ isLoggedIn }: { isLoggedIn: boolean }) {
    const menu = [
        { label: "Dashboard", icon: Home, href: "/dashboard/home" },
        { label: "Analytics", icon: BarChart3, href: "/dashboard/products" },
        { label: "Chat", icon: MessageCircle, href: "/dashboard/contact" },
        { label: "Calendar", icon: Calendar, href: "/dashboard/about" },
    ];

    const stores = [
        { label: "Fashion Hive", href: "#" },
        { label: "HealthMart", href: "#", active: true },
        { label: "TechNest", href: "#" },
    ];

    return (
        <aside className="h-screen w-72 bg-gray-50 border-r flex flex-col justify-between px-4 py-6">
            {/* TOP */}
            <div>
                {/* Logo */}
                <div className="flex items-center gap-2 px-2 mb-6">
                    <div className="w-8 h-8 bg-blue-600 rounded-md" />
                    <span className="text-lg font-semibold">InsightHub</span>
                </div>

                {/* Search */}
                <div className="mb-6 px-2">
                    <input
                        type="text"
                        placeholder="Search"
                        className="w-full px-3 py-2 text-sm bg-white border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* MENU */}
                <div className="mb-6">
                    <p className="text-xs text-gray-400 px-2 mb-2">MENU</p>
                    <ul className="space-y-1">
                        {menu.map((item, i) => {
                            const Icon = item.icon;
                            return (
                                <li key={i}>
                                    <Link
                                        href={item.href}
                                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 hover:bg-white hover:shadow-sm hover:text-blue-600 transition"
                                    >
                                        <Icon size={18} />
                                        {item.label}
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* STORES */}
                <div className="mb-6">
                    <p className="text-xs text-gray-400 px-2 mb-2">STORES</p>
                    <ul className="space-y-1">
                        {stores.map((store, i) => (
                            <li key={i}>
                                <Link
                                    href={store.href}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${store.active
                                        ? "bg-white shadow-sm text-gray-900 font-medium"
                                        : "text-gray-500 hover:bg-white hover:shadow-sm"
                                        }`}
                                >
                                    <Store size={16} />
                                    {store.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* BOTTOM */}
            <div>
                <p className="text-xs text-gray-400 px-2 mb-2">OTHERS</p>
                <div className="space-y-1 mb-4">
                    <Link
                        href="#"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 hover:bg-white"
                    >
                        <HelpCircle size={18} />
                        Help
                    </Link>

                    <Link
                        href="#"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-600 hover:bg-white"
                    >
                        <Settings size={18} />
                        Settings
                    </Link>
                </div>

                {isLoggedIn && (
                    <form action={logoutAction}>
                        <Button variant="ghost" className="w-full justify-start">
                            Logout
                        </Button>
                    </form>
                )}
            </div>
        </aside>
    );
}