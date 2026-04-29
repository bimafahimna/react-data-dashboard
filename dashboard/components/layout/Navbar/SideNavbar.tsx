"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { logoutAction } from "@/app/(auth)/logoutAction";
import {
    Home,
    BarChart3,
    Settings,
    HelpCircle,
    Store,
} from "lucide-react";

type NavItem = { label: string; href: string };

export default function Sidebar({
    isLoggedIn,
    stores,
}: {
    isLoggedIn: boolean;
    stores: NavItem[];
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const menu: { label: string; icon: React.ElementType; href: string }[] = [
        { label: "Dashboard", icon: Home, href: "/dashboard" },
        { label: "Data", icon: BarChart3, href: "/dashboard/data" },
        { label: "Settings", icon: Settings, href: "/dashboard/settings" },
    ];

    const isActiveLink = (href: string) => {
        const [targetPath, targetQuery] = href.split("?");
        const pathMatches = pathname === targetPath;

        if (!pathMatches) {
            return false;
        }

        if (!targetQuery) {
            return true;
        }

        const targetParams = new URLSearchParams(targetQuery);
        return Array.from(targetParams.entries()).every(
            ([key, value]) => searchParams.get(key) === value,
        );
    };

    return (
        <aside className="sticky top-0 h-screen w-72 shrink-0 overflow-y-auto border-r bg-gray-50 px-4 py-6">
            {/* TOP */}
            <div className="flex min-h-full flex-col justify-between">
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
                        {menu.map((item) => {
                            const Icon = item.icon;
                            const isActive = isActiveLink(item.href);
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-md transition ${
                                            isActive
                                                ? "bg-white shadow-sm text-gray-900 font-medium"
                                                : "text-gray-600 hover:bg-white hover:shadow-sm hover:text-blue-600"
                                        }`}
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
                        {stores.map((store) => (
                            <li key={store.href}>
                                <Link
                                    href={store.href}
                                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${isActiveLink(store.href)
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
            <div className="mt-6">
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
            </div>
        </aside>
    );
}