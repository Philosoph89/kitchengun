import { NavLink } from 'react-router-dom';
import { CalendarDays, Package, Search, ShoppingCart, Utensils } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="nav-brand">
        <Utensils size={28} />
        <span>KitchenGun</span>
      </NavLink>
      
      <div className="nav-links">
        <NavLink to="/" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <Utensils size={20} />
          <span>Rezepte</span>
        </NavLink>
        <NavLink to="/discover" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <Search size={20} />
          <span>Entdecken</span>
        </NavLink>
        <NavLink to="/planner" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <CalendarDays size={20} />
          <span>Planer</span>
        </NavLink>
        <NavLink to="/inventory" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <Package size={20} />
          <span>Vorrat</span>
        </NavLink>
        <NavLink to="/shopping-list" className={({isActive}) => isActive ? "nav-link active" : "nav-link"}>
          <ShoppingCart size={20} />
          <span>Einkaufsliste</span>
        </NavLink>
      </div>
    </nav>
  );
}
