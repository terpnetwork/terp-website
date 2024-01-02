import React from "react";
import {Link} from "gatsby";
import terpnetworklogo from '../images/terpnetwork-logo.png'

const menu = require('../contents/urls.json');

class Header extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            menuOpen: false
        };
    }
    componentDidMount() {
        window.addEventListener("scroll", this.toggleHeaderClass);
        this.toggleHeaderClass();
    }
    toggleMenu = function(){
        document.getElementById('menu').classList.toggle('open');
    }
    toggleHeaderClass = () => {
        if(!document.getElementById("header").classList.contains('menu-opened')){
            if (window.scrollY > 100) {
                document.getElementById("header").classList.add("blur");
            } else {
                document.getElementById("header").classList.remove("blur");
            }
        }
    };
    render() {
        return (
            <header id={'header'} className={this.state.menuOpen ? 'menu-opened blur' : 'blur'}>
                <div className={'header-bg'}/>
                <div className={'container'}>
                <Link to={'/'}>
    <div className={'logo'}>
        <img src={terpnetworklogo} alt={'Terp Network Logo'}  className={'logo-image'}/>
    </div>
</Link>

                    <button className={this.state.menuOpen ? 'hamburger hamburger--slider is-active' : 'hamburger hamburger--slider'} type="button" onClick={() => this.setState({ menuOpen: !this.state.menuOpen })}>
                          <span className="hamburger-box">
                            <span className="hamburger-inner"/>
                          </span>
                    </button>

                    <nav>
                        <ul>
                            <li><Link to={menu.ecosystem}>Ecosystem</Link></li>
                            <li><a href={menu.docs} target={'_blank'} rel={'noreferrer'}>Docs</a></li>
                            <li><a href={menu.blog} target={'_blank'} rel={'noreferrer'}>Blog</a></li>
                            <li><a href={menu.updates} target={'_blank'} rel={'noreferrer'}>Updates</a></li>
                            <li className={'social'}><a href={menu.github} target={'_blank'} rel={'noreferrer'}><i className={'icon-social-github'} aria-label={'Github'}></i></a></li>
                            <li className={'social'}><a href={menu.discord} target={'_blank'} rel={'noreferrer'}><i className={'icon-social-discord'} aria-label={'Discord'}></i></a></li>
                        </ul>
                    </nav>
                </div>
            </header>
        );
    }
}

export default Header;
