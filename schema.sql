--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.5 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: book_merge_exceptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.book_merge_exceptions (
    variant_id integer NOT NULL
);


ALTER TABLE public.book_merge_exceptions OWNER TO postgres;

--
-- Name: book_merges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.book_merges (
    variant_id integer NOT NULL,
    base_id integer NOT NULL
);


ALTER TABLE public.book_merges OWNER TO postgres;

--
-- Name: books; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.books (
    id integer NOT NULL,
    title text,
    author text,
    author_url text,
    thumbnail_url text,
    page integer
);


ALTER TABLE public.books OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    name text,
    avatar_url text,
    books_read integer,
    pages_read integer,
    sync_status text,
    bookcase text,
    original_books_read integer,
    original_pages_read integer
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: failed_users; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.failed_users AS
 SELECT id,
    name,
    avatar_url,
    books_read,
    pages_read,
    sync_status
   FROM public.users
  WHERE (sync_status = 'failed'::text);


ALTER VIEW public.failed_users OWNER TO postgres;

--
-- Name: groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.groups (
    id integer NOT NULL,
    name text,
    password text
);


ALTER TABLE public.groups OWNER TO postgres;

--
-- Name: groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.groups_id_seq OWNER TO postgres;

--
-- Name: groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.groups_id_seq OWNED BY public.groups.id;


--
-- Name: manual_book_merges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.manual_book_merges (
    variant_id integer NOT NULL,
    base_id integer NOT NULL
);


ALTER TABLE public.manual_book_merges OWNER TO postgres;

--
-- Name: metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.metadata (
    last_updated timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);


ALTER TABLE public.metadata OWNER TO postgres;

--
-- Name: reads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reads (
    user_id integer NOT NULL,
    book_id integer NOT NULL,
    merged_book_id integer DEFAULT 334913 NOT NULL,
    date date,
    id integer NOT NULL
);


ALTER TABLE public.reads OWNER TO postgres;

--
-- Name: reads_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reads_id_seq OWNER TO postgres;

--
-- Name: reads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reads_id_seq OWNED BY public.reads.id;


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reviews (
    id integer NOT NULL,
    created_at date,
    content text,
    is_spoiler boolean,
    nice_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.reviews OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.reviews_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.reviews_id_seq OWNER TO postgres;

--
-- Name: reviews_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.reviews_id_seq OWNED BY public.reviews.id;


--
-- Name: users_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users_groups (
    user_id integer NOT NULL,
    group_id integer NOT NULL
);


ALTER TABLE public.users_groups OWNER TO postgres;

--
-- Name: groups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups ALTER COLUMN id SET DEFAULT nextval('public.groups_id_seq'::regclass);


--
-- Name: reviews id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews ALTER COLUMN id SET DEFAULT nextval('public.reviews_id_seq'::regclass);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: yearly_leaderboard; Type: MATERIALIZED VIEW; Schema: public; Owner: postgres
--

CREATE MATERIALIZED VIEW public.yearly_leaderboard AS
 SELECT u.id,
    u.name,
    u.avatar_url,
    sum(b.page) AS pages_read,
    count(DISTINCT r.merged_book_id) AS books_read
   FROM ((public.reads r
     JOIN public.books b ON ((r.merged_book_id = b.id)))
     JOIN public.users u ON ((r.user_id = u.id)))
  WHERE ((r.date >= date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone)) AND (r.date < (date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone) + '1 year'::interval)))
  GROUP BY u.id
  WITH NO DATA;


ALTER MATERIALIZED VIEW public.yearly_leaderboard OWNER TO postgres;

--
-- Name: book_merge_exceptions book_merge_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.book_merge_exceptions
    ADD CONSTRAINT book_merge_exceptions_pkey PRIMARY KEY (variant_id);


--
-- Name: book_merges book_merges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.book_merges
    ADD CONSTRAINT book_merges_pkey PRIMARY KEY (variant_id);


--
-- Name: books books_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.books
    ADD CONSTRAINT books_pkey PRIMARY KEY (id);


--
-- Name: users_groups group_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_groups
    ADD CONSTRAINT group_users_pkey PRIMARY KEY (user_id, group_id);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: manual_book_merges manual_book_merges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.manual_book_merges
    ADD CONSTRAINT manual_book_merges_pkey PRIMARY KEY (variant_id);


--
-- Name: reads reads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reads
    ADD CONSTRAINT reads_pkey PRIMARY KEY (id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: idx_reads_book_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reads_book_id ON public.reads USING btree (book_id);


--
-- Name: idx_reads_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reads_date ON public.reads USING btree (date);


--
-- Name: idx_reads_merged_book_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reads_merged_book_id ON public.reads USING btree (merged_book_id);


--
-- Name: pgroonga_books_author_nospace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pgroonga_books_author_nospace_idx ON public.books USING pgroonga (replace(author, ' '::text, ''::text));


--
-- Name: pgroonga_books_title_nospace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX pgroonga_books_title_nospace_idx ON public.books USING pgroonga (replace(title, ' '::text, ''::text));


--
-- Name: reads_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX reads_user_id ON public.reads USING btree (user_id);


--
-- Name: users_books_pages_desc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX users_books_pages_desc_idx ON public.users USING btree (books_read DESC, pages_read DESC);


--
-- Name: reads books_merged_book_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reads
    ADD CONSTRAINT books_merged_book_id FOREIGN KEY (merged_book_id) REFERENCES public.books(id);


--
-- Name: users_groups group_users_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_groups
    ADD CONSTRAINT group_users_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id);


--
-- Name: users_groups group_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users_groups
    ADD CONSTRAINT group_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: reads reads_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reads
    ADD CONSTRAINT reads_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id);


--
-- Name: reads reads_merged_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reads
    ADD CONSTRAINT reads_merged_book_id_fkey FOREIGN KEY (merged_book_id) REFERENCES public.books(id);


--
-- Name: reads reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reads
    ADD CONSTRAINT reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: metadata; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.metadata ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

